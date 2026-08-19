import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { BakedLogo } from "./BakedLogo";
import { useAuth, useApp, useCart } from "../../contexts/BakedContexts";
import { NAV } from "../../constants/testIds";
import { formatMoney, t } from "../../lib/i18n";
import { Search, Tag, Package, User, ShoppingCart, Sun, Moon, LogOut, MapPin, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Button } from "../ui/button";
import { AddressPill } from "../address/AddressPill";
import { toast } from "sonner";

const DETECT_REASON_COPY = {
  denied:                "Location permission is blocked. Enable it in your browser settings, then try again.",
  unavailable:           "Couldn't read your location right now. Try again in a moment.",
  timeout:               "Location request timed out. Move to an open area or try again.",
  unsupported:           "This device doesn't support location detection.",
  no_maps:               "Maps service is unavailable. Try again in a moment.",
  not_supported_country: "We haven't launched in your country yet — you can pick a supported one below.",
  no_country:            "Couldn't determine your country. Pick one from the list.",
};

export const TopNav = () => {
  const { customer, logout, openLogin } = useAuth();
  const { country, countries, setCountryCode, detectCountryByLocation, theme, toggleTheme, language, setLanguage } = useApp();
  const { cart } = useCart();
  const navigate = useNavigate();
  const [detecting, setDetecting] = React.useState(false);

  const locale = language ? `${language}-${country?.code || "CI"}` : (country?.locale || "en");

  const onDetectClick = async () => {
    setDetecting(true);
    const res = await detectCountryByLocation();
    setDetecting(false);
    if (res.ok) {
      const c = countries.find((x) => x.code === res.iso);
      toast.success(`Detected — switched to ${c?.name || res.iso}`);
    } else {
      toast.error(DETECT_REASON_COPY[res.reason] || "Couldn't detect your location.");
    }
  };

  return (
    <>
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="baked-container flex items-center gap-4 py-3">
          <Link to="/" data-testid={NAV.logo} className="shrink-0 mr-2">
            <BakedLogo size="md" />
          </Link>

          {/* Delivery address — opens the Address Selector */}
          <AddressPill variant="desktop" testid={NAV.deliveryAddress} />

          {/* Country selector — determines currency, language, and available services (NOT delivery) */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                data-testid={NAV.countrySelect}
                className="hidden md:flex items-center gap-1.5 px-2.5 py-2 baked-btn border border-border hover:bg-secondary motion-fast"
                aria-label="Change country"
              >
                <span className="text-lg leading-none">{country?.flag}</span>
                <span className="text-xs font-semibold">{country?.code}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64">
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-2">Country · currency · services</div>
              <div className="grid gap-1.5">
                {countries.map((c) => (
                  <button
                    key={c.code}
                    data-testid={`${NAV.countrySelect}-${c.code}`}
                    onClick={() => setCountryCode(c.code)}
                    className={`flex items-center gap-3 px-3 py-2 baked-btn hover:bg-secondary text-left ${country?.code === c.code ? "bg-secondary" : ""}`}
                  >
                    <span className="text-xl">{c.flag}</span>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{c.name}</div>
                      <div className="text-[11px] text-muted-foreground">{c.currency} · {c.locale}</div>
                    </div>
                  </button>
                ))}
              </div>
              {/* "Use my location" chip — re-run geolocation for users who
                  dismissed the first-visit prompt or changed their mind. */}
              <button
                data-testid="country-detect-chip"
                onClick={onDetectClick}
                disabled={detecting}
                className="mt-3 w-full flex items-center justify-center gap-2 h-9 rounded-lg text-xs font-semibold border border-border bg-secondary/50 hover:bg-secondary motion-fast disabled:opacity-60"
              >
                {detecting ? <Loader2 size={12} className="animate-spin" /> : <MapPin size={12} />}
                {detecting ? "Detecting…" : "Use my location"}
              </button>
            </PopoverContent>
          </Popover>

          {/* Search */}
          <div className="flex-1 max-w-[560px]">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
              <input
                data-testid={NAV.searchInput}
                placeholder={t(locale, "nav.search_placeholder")}
                className="baked-input w-full pl-11 pr-4 py-3 bg-secondary text-sm outline-none focus:ring-2 focus:ring-primary/40 motion-fast"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.currentTarget.value.trim()) {
                    navigate(`/products?search=${encodeURIComponent(e.currentTarget.value.trim())}`);
                  }
                }}
              />
            </div>
          </div>

          {/* Right actions */}
          <button data-testid={NAV.offers} className="hidden lg:flex flex-col items-center px-2 py-1 hover:opacity-80 motion-fast" onClick={() => navigate("/products?sort=price_asc")}>
            <Tag size={20} />
            <span className="text-[11px] mt-0.5">{t(locale, "nav.offers")}</span>
          </button>
          <button data-testid={NAV.orders} className="hidden lg:flex flex-col items-center px-2 py-1 hover:opacity-80 motion-fast">
            <Package size={20} />
            <span className="text-[11px] mt-0.5">{t(locale, "nav.orders")}</span>
          </button>

          {customer ? (
            <button data-testid={NAV.account} onClick={() => navigate("/profile")} className="flex flex-col items-center px-2 py-1 hover:opacity-80 motion-fast">
              {customer.picture ? (
                <img src={customer.picture} alt="me" className="w-6 h-6 rounded-full object-cover" />
              ) : (
                <User size={20} />
              )}
              <span className="text-[11px] mt-0.5 max-w-[80px] truncate">{customer.name || customer.phone || t(locale, "nav.account")}</span>
            </button>
          ) : (
            <button
              data-testid="auth-open-login-btn"
              onClick={() => openLogin("/profile")}
              className="flex flex-col items-center px-2 py-1 hover:opacity-80 motion-fast"
            >
              <User size={20} />
              <span className="text-[11px] mt-0.5">{t(locale, "nav.login")}</span>
            </button>
          )}

          {/* Cart */}
          <button
            data-testid={NAV.cartButton}
            onClick={() => navigate("/cart")}
            className="relative baked-btn px-3 py-2 bg-secondary hover:bg-secondary/80 motion-fast flex items-center gap-2"
          >
            <ShoppingCart size={18} style={{ color: "#77BC1F" }} />
            <span data-testid={NAV.cartCount} className="absolute -top-1 -left-1 text-[10px] bg-[hsl(var(--mart))] text-black font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {cart.item_count || 0}
            </span>
            <span data-testid={NAV.cartTotal} className="text-sm font-semibold">
              {formatMoney(cart.subtotal || 0, country?.currency, country?.currency_symbol)}
            </span>
          </button>

          {/* Language switcher — FR / EN, no flag */}
          <div
            data-testid="top-nav-language-switcher"
            className="baked-btn overflow-hidden border border-border flex items-stretch text-xs font-semibold"
            role="group"
            aria-label="Language"
          >
            <button
              data-testid="top-nav-language-fr"
              onClick={() => setLanguage("fr")}
              className={`px-3 py-2 motion-fast ${language === "fr" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
              aria-pressed={language === "fr"}
            >
              FR
            </button>
            <div className="w-px bg-border" />
            <button
              data-testid="top-nav-language-en"
              onClick={() => setLanguage("en")}
              className={`px-3 py-2 motion-fast ${language === "en" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground hover:text-foreground"}`}
              aria-pressed={language === "en"}
            >
              EN
            </button>
          </div>

          {/* Theme toggle */}
          <button
            data-testid={NAV.themeToggle}
            onClick={toggleTheme}
            className="baked-btn w-10 h-10 flex items-center justify-center bg-secondary hover:bg-secondary/80 motion-fast"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </div>
    </>
  );
};
