import React from "react";
import { MapPin, ChevronDown } from "lucide-react";
import { useApp } from "../../contexts/BakedContexts";

/**
 * AddressPill — tap-target used in the top nav (desktop) and mobile header.
 * Opens the shared AddressSelector via AppContext. Falls back to a friendly
 * "Set delivery address" prompt when the user hasn't picked one yet.
 */
export const AddressPill = ({ variant = "desktop", testid = "addr-pill" }) => {
  const { activeAddress, openAddressSelector, country } = useApp();
  const line1 = activeAddress?.formatted_address || activeAddress?.line1;
  const label = activeAddress?.label;
  const city = activeAddress?.city;

  if (variant === "mobile") {
    return (
      <button
        data-testid={testid}
        onClick={openAddressSelector}
        className="flex items-start gap-2 text-left min-w-0 max-w-[70vw]"
      >
        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: "#77BC1F22", color: "#77BC1F" }}>
          <MapPin size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1">
            {activeAddress ? (label || "Deliver to") : "Choose"}
            <ChevronDown size={10} />
          </div>
          <div className="text-sm font-bold truncate">
            {line1 || `Set delivery address · ${country?.name || ""}`}
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
      <MapPin size={18} style={{ color: "#77BC1F" }} />
      <div className="text-left">
        <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
          {activeAddress ? (label ? `Deliver to · ${label}` : "Delivering to") : "Choose delivery"}
        </div>
        <div className="text-sm font-medium max-w-[240px] truncate">
          {line1 || `Set your delivery address`}
        </div>
        {activeAddress && city && (
          <div className="text-[10px] text-muted-foreground max-w-[240px] truncate">{city}</div>
        )}
      </div>
      <ChevronDown size={14} className="text-muted-foreground" />
    </button>
  );
};
