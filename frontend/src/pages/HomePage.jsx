import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useApp } from "../contexts/BakedContexts";
import { ProductCard } from "../components/mart/ProductCard";
import { MartLogoImage } from "../components/layout/BakedLogo";
import { HOME, CATEGORY, AI } from "../constants/testIds";
import { formatMoney, t } from "../lib/i18n";
import { useLocalePath } from "../i18n/routes";
import { Bike, Truck, ShoppingBasket, Wallet2, Sparkles, ArrowRight, Zap, Package, Tag, RotateCcw } from "lucide-react";
import { Button } from "../components/ui/button";
import { toast } from "sonner";

// Popular neighborhoods surfaced under the "Delivery in X min" card.
// Keep the two-to-three most recognisable zones per launch country so the
// chip strip feels curated. LR intentionally omitted from the UI per the P0
// correction pass — the row still exists in the DB.
const POPULAR_ZONES = {
  CI: ["Cocody", "Plateau", "Marcory"],
  IN: ["Connaught Place", "Saket", "Karol Bagh"],
};

export const HomePage = () => {
  const { country, uiLocale, language } = useApp();
  const navigate = useNavigate();
  const path = useLocalePath();
  const locale = uiLocale;
  const [categories, setCategories] = useState([]);
  const [deals, setDeals] = useState([]);
  const [aiQuery, setAiQuery] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiSummary, setAiSummary] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [c, p] = await Promise.all([
          api.get(`/mart/categories?country=${country.code}`),
          api.get(`/mart/products?country=${country.code}&limit=18`),
        ]);
        setCategories(c.data);
        setDeals(p.data);
      } catch (e) { console.error(e); }
    })();
  }, [country?.code]);

  const runAiSearch = async () => {
    if (!aiQuery.trim()) return;
    setAiBusy(true);
    try {
      const { data } = await api.post("/ai/search", { query: aiQuery, country: country.code, module: "mart" });
      setAiSummary(data.filters?.summary);
      if (data.products?.length) {
        navigate(`${path("products")}?search=${encodeURIComponent(aiQuery)}`);
      } else {
        toast("No matches — try broader terms");
      }
    } catch (e) {
      toast.error("AI search failed. Please retry.");
    } finally { setAiBusy(false); }
  };

  const heroImg = "https://images.unsplash.com/photo-1542838132-92c53300491e?w=900&auto=format&fit=crop&q=70";

  return (
    <div className="pb-8">
      {/* Hero + Delivery card */}
      <div className="baked-container mt-6 grid gap-4 lg:grid-cols-[1fr_360px]" data-testid={HOME.hero}>
        <div className="baked-card relative overflow-hidden group aspect-[16/9] lg:aspect-auto lg:min-h-[380px]">
          <img
            src="https://customer-assets-4nw71qhi.emergentagent.net/job_baked-platform/artifacts/mreak2b7_MARTbaked_Banner.png"
            alt="MARTbakēd — Everything you need, delivered in minutes"
            className="absolute inset-0 w-full h-full object-cover object-center"
            draggable={false}
          />
          {/* Left-side gradient so text + CTAs stay legible over the artwork */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent pointer-events-none" />
          <div className="relative z-10 h-full flex flex-col justify-between p-6 md:p-8">
            <div className="max-w-[560px]">
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold leading-tight text-white">
                {t(locale, "hero.mart.title_l1")}
                <br />
                <span style={{ color: "#77BC1F" }}>{t(locale, "hero.mart.title_l2")}</span>
              </h1>
              <p className="mt-3 text-sm md:text-base text-white/80 max-w-md">{t(locale, "hero.mart.subtitle")}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button data-testid={HOME.shopNowBtn} onClick={() => navigate(path("products"))} className="baked-btn h-11 px-6 font-semibold text-black shadow-xl" style={{ backgroundColor: "#77BC1F" }}>
                {t(locale, "hero.shop_now")}
              </Button>
              <Button data-testid={HOME.browseCategoriesBtn} onClick={() => navigate("/categories")} variant="outline" className="baked-btn h-11 px-6 font-semibold border-white/40 bg-black/30 backdrop-blur-sm text-white hover:bg-white/10 hover:text-white">
                {t(locale, "hero.browse")}
              </Button>
            </div>
          </div>
        </div>

        {/* Delivery card */}
        <div className="delivery-card p-5 flex flex-col gap-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs text-muted-foreground">{t(locale, "delivery.title")}</div>
              <div className="text-3xl font-bold mt-1">{country.delivery_eta_min}</div>
            </div>
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }}>
              <Bike size={26} />
            </div>
          </div>
          <div className="h-px bg-border" />
          <div className="text-xs text-muted-foreground">
            {t(locale, "delivery.free_over")} <span className="font-semibold text-foreground">{formatMoney(country.free_delivery_over, country.currency, country.currency_symbol)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm mt-2">
            <div>
              <div className="text-[11px] text-muted-foreground">{t(locale, "delivery.fee")}</div>
              <div className="font-semibold">{formatMoney(country.delivery_fee, country.currency, country.currency_symbol)}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">{t(locale, "delivery.min_order")}</div>
              <div className="font-semibold">{formatMoney(country.min_order, country.currency, country.currency_symbol)}</div>
            </div>
          </div>
          <div className="h-px bg-border" />
          <div className="text-[11px] text-muted-foreground">{t(locale, "delivery.popular_near")}</div>
          <div className="flex flex-wrap gap-2">
            {/* Popular neighborhoods per country. Kept as a small map so
                new BAKĒD launch countries can be added without touching
                the render code. */}
            {(POPULAR_ZONES[country.code] || POPULAR_ZONES.CI).map((z, i) => (
              <span key={z} className={`baked-chip text-[11px] px-3 py-1 border border-border ${i === 0 ? "text-black" : ""}`} style={i === 0 ? { backgroundColor: "#77BC1F" } : {}}>
                {z}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* AI search band */}
      <div className="baked-container mt-6">
        <div className="baked-card bg-card border border-border p-5 flex flex-col md:flex-row items-stretch gap-3">
          <div className="flex items-center gap-3 min-w-fit">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#1D9BF022", color: "#1D9BF0" }}>
              <Sparkles size={20} />
            </div>
            <div>
              <div className="text-sm font-semibold">bakēd AI Assistant</div>
              <div className="text-[11px] text-muted-foreground">Ask in natural language — French or English</div>
            </div>
          </div>
          <div className="flex-1 flex gap-2">
            <input
              data-testid={AI.searchInput}
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runAiSearch()}
              placeholder={locale.startsWith("fr") ? "ex: petit-déjeuner rapide pour 4 personnes" : "e.g. quick breakfast for 4 people"}
              className="flex-1 baked-input bg-secondary px-4 py-3 outline-none text-sm"
            />
            <Button data-testid={AI.searchSubmit} onClick={runAiSearch} disabled={aiBusy} className="baked-btn h-11 px-5 font-semibold" style={{ backgroundColor: "#1D9BF0", color: "white" }}>
              {aiBusy ? "…" : "Ask AI"}
            </Button>
          </div>
        </div>
        {aiSummary && (
          <div data-testid={AI.searchSummary} className="text-xs text-muted-foreground mt-2 pl-2 italic">✨ {aiSummary}</div>
        )}
      </div>

      {/* Content grid: sidebar + top categories + deals */}
      <div className="baked-container mt-8 grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* Sidebar categories */}
        <aside className="hidden lg:block">
          <div className="baked-card bg-card border border-border p-4 sticky top-24">
            <div className="text-sm font-semibold mb-3">{t(locale, "sec.categories")}</div>
            <div className="grid gap-1">
              <button className="text-left text-sm px-3 py-2 baked-btn bg-secondary font-medium">■ {t(locale, "sec.all_categories")}</button>
              {categories.map((c) => {
                const displayName = language === "en" ? (c.name_en || c.name) : (c.name_fr || c.name);
                return (
                <button
                  key={c.slug}
                  data-testid={CATEGORY.sidebarItem(c.slug)}
                  onClick={() => navigate(`/categories/${c.slug}`)}
                  className="text-left text-sm px-3 py-2 baked-btn hover:bg-secondary motion-fast text-muted-foreground hover:text-foreground"
                >
                  {displayName}
                </button>
                );
              })}
            </div>
            <button onClick={() => navigate("/categories")} className="text-xs mt-4 px-3 py-2 flex items-center gap-2" style={{ color: "#77BC1F" }}>
              <span>▦</span> View all categories
            </button>
          </div>
        </aside>

        {/* Right column */}
        <div className="min-w-0">
          {/* Top categories */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">{t(locale, "sec.top_categories")}</h2>
            <button onClick={() => navigate("/categories")} className="text-xs font-semibold" style={{ color: "#77BC1F" }}>{t(locale, "sec.view_all")}</button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {categories.slice(0, 6).map((c) => {
              const displayName = language === "en" ? (c.name_en || c.name) : (c.name_fr || c.name);
              return (
              <button
                key={c.slug}
                data-testid={CATEGORY.card(c.slug)}
                onClick={() => navigate(`/categories/${c.slug}`)}
                className="baked-card bg-card border border-border overflow-hidden group motion-normal hover:border-[#77BC1F]/60"
              >
                <div className="aspect-square bg-secondary/40 overflow-hidden">
                  <img src={c.image} alt={displayName} className="w-full h-full object-cover motion-normal group-hover:scale-105" loading="lazy" />
                </div>
                <div className="p-2 text-xs font-semibold text-center">{displayName}</div>
              </button>
              );
            })}
          </div>

          {/* Best deals */}
          <div className="flex items-center justify-between mt-8 mb-3">
            <h2 className="text-lg font-semibold">{t(locale, "sec.best_deals")}</h2>
            <button onClick={() => navigate(`${path("products")}?sort=price_asc`)} className="text-xs font-semibold" style={{ color: "#77BC1F" }}>{t(locale, "sec.view_all")}</button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {deals.slice(0, 12).map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </div>
      </div>

      {/* Features strip */}
      <div className="baked-container mt-10">
        <div className="baked-card bg-card border border-border p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Zap, title: t(locale, "features.fast"), sub: t(locale, "features.fast_sub") },
            { icon: Package, title: t(locale, "features.wide"), sub: t(locale, "features.wide_sub") },
            { icon: Tag, title: t(locale, "features.deals"), sub: t(locale, "features.deals_sub") },
            { icon: RotateCcw, title: t(locale, "features.returns"), sub: t(locale, "features.returns_sub") },
          ].map((f, i) => {
            const Icon = f.icon;
            return (
              <div key={i} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }}>
                  <Icon size={20} />
                </div>
                <div>
                  <div className="text-sm font-semibold">{f.title}</div>
                  <div className="text-[11px] text-muted-foreground">{f.sub}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
