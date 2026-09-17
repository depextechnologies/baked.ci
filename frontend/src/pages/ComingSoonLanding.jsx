import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Sparkles, ArrowLeft } from "lucide-react";
import { BakedLogo } from "../components/layout/BakedLogo";

/**
 * Reusable placeholder for the 18 footer routes. Every route resolves
 * here until its dedicated content is authored. Bilingual FR/EN: keys
 * live in `landing.<slug>.title` / `.desc`; unknown slugs fall back to
 * a humanised label + generic "coming soon" body.
 */

// Slug → i18n-key mapping so labels stay in JSON and are trivially
// translated. Some paths contain slashes; we normalise to
// `slash.replace('/','_')` for JSON key friendliness.
const slugToKey = (slug) => slug.replace(/\//g, "_");

const humanize = (slug) =>
  slug
    .split("/")
    .map((s) => s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))
    .join(" · ");

export const ComingSoonLanding = () => {
  const { t } = useTranslation("landing");
  const { t: tCommon } = useTranslation("common");
  const location = useLocation();
  const slug = location.pathname.replace(/^\//, "");
  const key = slugToKey(slug);

  // i18next returns the key path when nothing matches → we treat that as
  // "no translation" and fall back to the humanised slug.
  const title = t(`${key}.title`, { defaultValue: humanize(slug) });
  const description = t(`${key}.desc`, { defaultValue: t("_default.desc") });

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-24">
      <div data-testid={`coming-soon-${slug.replace(/\//g, "-")}`} className="max-w-xl w-full text-center">
        <div className="flex justify-center mb-6"><BakedLogo size="md" /></div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border border-border bg-secondary text-muted-foreground mb-4">
          <Sparkles size={11} /> {tCommon("state.coming_soon")}
        </div>
        <h1 className="text-2xl md:text-3xl font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{description}</p>
        <div className="mt-8">
          <Link
            to="/"
            data-testid="coming-soon-back-home"
            className="inline-flex items-center gap-2 h-11 px-5 rounded-2xl font-semibold text-black motion-fast active:scale-[0.98]"
            style={{ backgroundColor: "#FCC44C" }}
          >
            <ArrowLeft size={15} strokeWidth={2.5} /> {t("_default.back_home")}
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ComingSoonLanding;
