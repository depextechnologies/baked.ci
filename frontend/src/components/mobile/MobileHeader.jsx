import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Wallet2, Bell } from "lucide-react";
import { useApp } from "../../contexts/BakedContexts";
import { BakedLogo } from "../layout/BakedLogo";
import { t } from "../../lib/i18n";
import { AddressPill } from "../address/AddressPill";

/**
 * MobileHeader — replicates the mobile app top bar:
 *   Row 1: BAKĒD logo (compact) · Address pill · Wallet + Notifications
 *   Row 2: Search bar
 * Sticky by default; participates in the mobile shell.
 */
export const MobileHeader = ({ variant = "home", title }) => {
  const { country, language } = useApp();
  const navigate = useNavigate();
  const locale = `${language}-${country?.code || "CI"}`;

  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border">
      <div className="px-4 pt-3 pb-2 flex items-center gap-3">
        <Link to="/" data-testid="m-header-logo" className="shrink-0"><BakedLogo size="sm" /></Link>

        <div className="flex-1 min-w-0">
          <AddressPill variant="mobile" testid="m-header-address" />
        </div>

        <button
          data-testid="m-header-wallet"
          onClick={() => navigate("/wallet")}
          className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 baked-chip bg-secondary text-xs font-semibold"
          title="Wallet"
        >
          <Wallet2 size={14} style={{ color: "#77BC1F" }} />
          <span>0 {country?.currency_symbol || country?.currency || ""}</span>
        </button>

        <button
          data-testid="m-header-notifications"
          className="shrink-0 relative w-9 h-9 rounded-full flex items-center justify-center bg-secondary hover:bg-secondary/80 motion-fast"
          aria-label="Notifications"
        >
          <Bell size={16} />
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full" style={{ backgroundColor: "#FF4C52" }} />
        </button>
      </div>

      {variant === "home" ? (
        <div className="px-4 pb-3">
          <button
            data-testid="m-header-search"
            onClick={() => navigate("/products")}
            className="w-full flex items-center gap-2 px-3.5 py-2.5 baked-input bg-secondary text-xs text-muted-foreground"
          >
            <Search size={14} />
            <span className="truncate">{t(locale, "nav.search_placeholder")}</span>
          </button>
        </div>
      ) : (
        title && (
          <div className="px-4 pb-3">
            <div className="text-base font-semibold truncate">{title}</div>
          </div>
        )
      )}
    </header>
  );
};
