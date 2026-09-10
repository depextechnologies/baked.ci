/**
 * ShopCategoriesIndex — full SHOPbakēd category tree grid.
 * Rendered at `/shop/categories`. Fully French-first via useTranslation.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ShoppingBag, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/contexts/BakedContexts";
import { pickCatalogueName } from "../lib/i18nCms";

const SHOP_ACCENT = "#FCC44C";

const abs = (u) => (u && typeof u === "string" && u.startsWith("/")
  ? `${process.env.REACT_APP_BACKEND_URL}${u}`
  : u);

export const ShopCategoriesIndex = ({ basePath = "/shop" }) => {
  const { t, i18n } = useTranslation("customer");
  const lang = i18n.language === "fr" ? "fr" : "en";
  const { country } = useApp() || {};
  const cc = country?.code || "CI";
  const [tree, setTree] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.get(`/shop/catalogue?country=${cc}`)
      .then(({ data }) => !cancelled && setTree(data || []))
      .catch((e) => !cancelled && setError(e?.message || "Failed to load"));
    return () => { cancelled = true; };
  }, [cc]);

  if (error) {
    return (
      <div className="px-4 py-8 text-center" data-testid="shopbaked-categories-error">
        <p className="text-red-400 text-sm">{t("shop.error_prefix", { msg: error })}</p>
      </div>
    );
  }
  if (tree === null) {
    return (
      <div className="px-4 py-16 text-center text-neutral-400" data-testid="shopbaked-categories-loading">
        <Loader2 className="animate-spin inline" size={22} />
      </div>
    );
  }

  return (
    <div className="pb-24 mx-auto max-w-7xl px-4 sm:px-6" data-testid="shopbaked-categories-index">
      <div className="pt-4 pb-3">
        <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: SHOP_ACCENT }}>
          SHOPbakēd
        </div>
        <h1 className="text-2xl font-bold text-foreground">{t("shop.all_categories")}</h1>
        <p className="text-xs text-muted-foreground mt-1">
          {t("shop.all_categories_sub")}
        </p>
      </div>

      {tree.length === 0 ? (
        <div className="rounded-xl border border-border p-6 text-center">
          <ShoppingBag size={22} className="mx-auto mb-2 opacity-40" />
          <p className="text-xs text-muted-foreground">{t("shop.no_categories")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 md:grid-cols-4 lg:grid-cols-6 md:gap-4">
          {tree.map((c) => {
            const img = abs(c.image);
            const name = pickCatalogueName(c, lang);
            return (
              <Link
                key={c.id || c.slug}
                to={`${basePath}/c/${c.slug}`}
                data-testid={`shopbaked-cat-${c.slug}`}
                className="group rounded-2xl border border-border overflow-hidden bg-card hover:border-amber-400/60 transition-colors flex flex-col"
              >
                <div className="aspect-square bg-secondary/40 relative overflow-hidden">
                  {img ? (
                    <img
                      src={img}
                      alt={name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"
                         style={{ background: `${SHOP_ACCENT}18` }}>
                      <ShoppingBag size={22} style={{ color: SHOP_ACCENT }} />
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <div className="text-[11px] font-semibold text-foreground line-clamp-2 leading-tight">
                    {name}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {c.subcategories?.length || 0} {t("shop.sub_short")}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ShopCategoriesIndex;
