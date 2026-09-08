/**
 * Shared bilingual language switcher used across every BAKĒD shell:
 * customer web + mobile, admin, seller, driver, and auth dialogs. Keeps
 * the toggle look-and-feel identical everywhere so operators building
 * muscle memory in one shell find it in the same spot in the next.
 *
 * Wraps the `AppProvider.setLanguage` API (which now also drives
 * `i18n.changeLanguage` under the hood) so consumers just render this
 * component — no plumbing on their side.
 *
 * Props:
 *   - variant: "compact" (default) → two pill buttons "FR | EN"
 *              "menu"              → dropdown row for settings screens
 *              "inline"            → plain text link (used in auth footer)
 *   - onChange: optional callback fired after language swap
 *
 * Instrumentation: every rendered node carries a data-testid so the
 * testing agent can target FR/EN toggles in every shell without shell-
 * specific selectors.
 */

import { useTranslation } from "react-i18next";
import { useApp } from "@/contexts/BakedContexts";

const BTN_BASE =
  "px-2.5 py-1 text-xs font-semibold rounded-md transition-colors";

export const LanguageSwitcher = ({ variant = "compact", onChange, className = "" }) => {
  const { language, setLanguage } = useApp() || {};
  const { t } = useTranslation("common");
  const current = language || "fr";

  const swap = (next) => {
    if (next === current) return;
    setLanguage?.(next);
    onChange?.(next);
  };

  if (variant === "menu") {
    return (
      <div className={`flex items-center gap-2 ${className}`} data-testid="lang-switcher-menu">
        <span className="text-xs text-muted-foreground">{t("language.label")}</span>
        <button
          type="button"
          onClick={() => swap("fr")}
          className={`${BTN_BASE} ${current === "fr" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          data-testid="lang-switcher-fr"
          aria-pressed={current === "fr"}
        >
          {t("language.french")}
        </button>
        <button
          type="button"
          onClick={() => swap("en")}
          className={`${BTN_BASE} ${current === "en" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          data-testid="lang-switcher-en"
          aria-pressed={current === "en"}
        >
          {t("language.english")}
        </button>
      </div>
    );
  }

  if (variant === "inline") {
    const nextLng = current === "fr" ? "en" : "fr";
    return (
      <button
        type="button"
        onClick={() => swap(nextLng)}
        className={`text-xs underline underline-offset-2 hover:opacity-80 ${className}`}
        data-testid="lang-switcher-inline"
      >
        {nextLng === "fr" ? t("language.french") : t("language.english")}
      </button>
    );
  }

  // "compact" — default: two-pill toggle used in headers.
  return (
    <div
      className={`inline-flex items-center rounded-md bg-muted/60 p-0.5 ${className}`}
      role="group"
      aria-label={t("language.switch")}
      data-testid="lang-switcher"
    >
      <button
        type="button"
        onClick={() => swap("fr")}
        className={`${BTN_BASE} ${current === "fr" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        data-testid="lang-switcher-fr"
        aria-pressed={current === "fr"}
        title={t("language.french")}
      >
        {t("language.current_fr")}
      </button>
      <button
        type="button"
        onClick={() => swap("en")}
        className={`${BTN_BASE} ${current === "en" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        data-testid="lang-switcher-en"
        aria-pressed={current === "en"}
        title={t("language.english")}
      >
        {t("language.current_en")}
      </button>
    </div>
  );
};

export default LanguageSwitcher;
