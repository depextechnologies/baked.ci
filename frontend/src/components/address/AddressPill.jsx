import React from "react";
import { useTranslation } from "react-i18next";
import { MapPin, ChevronDown } from "lucide-react";
import { useApp } from "../../contexts/BakedContexts";
import { MODULES } from "../../lib/modules";

/**
 * AddressPill — tap-target used in the top nav (desktop) and mobile header.
 * Opens the shared AddressSelector via AppContext. Copy is fully i18n-driven
 * so the pill stays French-first (and swaps to English via the toggle).
 */
export const AddressPill = ({ variant = "desktop", testid = "addr-pill" }) => {
  const { t } = useTranslation("customer");
  const { activeAddress, openAddressSelector, country, activeModule } = useApp();
  const accent = React.useMemo(
    () => (MODULES.find((m) => m.code === activeModule)?.color) || "#77BC1F",
    [activeModule]
  );
  const line1 = activeAddress?.formatted_address || activeAddress?.line1;
  const label = activeAddress?.label;
  const city = activeAddress?.city;

  const setAddressLabel = t("address.pill.set_address", { defaultValue: "Set address" });
  const chooseDelivery = t("address.pill.choose_delivery", { defaultValue: "Choose delivery" });
  const deliveringTo = t("address.pill.delivering_to", { defaultValue: "Delivering to" });
  const deliverTo = t("address.pill.deliver_to", { defaultValue: "Deliver to" });

  if (variant === "mobile") {
    return (
      <button
        data-testid={testid}
        onClick={openAddressSelector}
        className="flex items-center gap-2 text-left min-w-0 w-full"
      >
        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${accent}22`, color: accent }}>
          <MapPin size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[9px] uppercase tracking-widest text-muted-foreground flex items-center gap-1 leading-none">
            <span>{deliverTo}</span>
            <ChevronDown size={10} />
          </div>
          <div className="text-[13px] font-bold truncate leading-tight mt-0.5">
            {line1 || `${setAddressLabel} · ${country?.name || ""}`}
          </div>
        </div>
      </button>
    );
  }

  // Desktop
  return (
    <button
      data-testid={testid}
      onClick={openAddressSelector}
      className="hidden md:flex items-center gap-2 px-3 py-2 baked-btn hover:bg-secondary motion-fast border border-border"
    >
      <MapPin size={18} style={{ color: accent }} />
      <div className="text-left min-w-0">
        <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
          {activeAddress ? (label ? `${deliverTo} · ${label}` : deliveringTo) : chooseDelivery}
        </div>
        <div className="text-sm font-medium max-w-[140px] xl:max-w-[240px] truncate">
          {line1 || setAddressLabel}
        </div>
        {activeAddress && city && (
          <div className="text-[10px] text-muted-foreground max-w-[140px] xl:max-w-[240px] truncate">{city}</div>
        )}
      </div>
      <ChevronDown size={14} className="text-muted-foreground" />
    </button>
  );
};
