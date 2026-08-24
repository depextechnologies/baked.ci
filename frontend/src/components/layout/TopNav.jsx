import React from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { BakedLogo } from "./BakedLogo";
import { useAuth, useApp, useCart } from "../../contexts/BakedContexts";
import { NAV } from "../../constants/testIds";
import { formatMoney, t } from "../../lib/i18n";
import { Search, Tag, Package, User, ShoppingCart, Sun, Moon, MapPin, Loader2, Menu, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetDescription } from "../ui/sheet";
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
  const location = useLocation();
  const [detecting, setDetecting] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // Social.docx §12 — auto-close the mobile drawer whenever the route changes
  // (e.g. tapping "Orders" inside the drawer navigates away — the drawer
  // must not linger on the new page).
  React.useEffect(() => { setDrawerOpen(false); }, [location.pathname, location.search]);

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
        <div className="baked-container flex items-center gap-2 md:gap-4 py-3">
          <Link to="/" data-testid={NAV.logo} className="shrink-0 mr-1 md:mr-2">
            <BakedLogo size="md" />
          </Link>

          {/* Delivery address — desktop only; below lg users open the picker from checkout / mobile shell */}
          <div className="hidden lg:block flex-shrink min-w-0">
            <AddressPill variant="desktop" testid={NAV.deliveryAddress} />
          </div>

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

          {/* Search — full input on desktop, icon-only on mobile */}
          <div className="hidden md:block flex-1 max-w-[560px]">
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
          {/* Mobile: search chevron that jumps to /products */}
          <button
            data-testid={`${NAV.searchInput}-mobile`}
            onClick={() => navigate("/products")}
            className="md:hidden ml-auto w-10 h-10 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center motion-fast"
            aria-label={t(locale, "nav.search_placeholder")}
          >
            <Search size={18} />
          </button>

          {/* Right actions — Offers/Orders/Account/Language/Theme all hidden on <md; live inside the drawer instead */}
          <button data-testid={NAV.offers} onClick={() => navigate("/products?sort=price_asc")}
                  className="hidden md:flex items-center justify-center w-10 h-10 rounded-full bg-secondary hover:bg-secondary/80 motion-fast shrink-0"
                  title={t(locale, "nav.offers")} aria-label={t(locale, "nav.offers")}>
            <Tag size={18} />
          </button>
          <button data-testid={NAV.orders} onClick={() => navigate("/orders")}
                  className="hidden md:flex items-center justify-center w-10 h-10 rounded-full bg-secondary hover:bg-secondary/80 motion-fast shrink-0"
                  title={t(locale, "nav.orders")} aria-label={t(locale, "nav.orders")}>
            <Package size={18} />
          </button>

          {customer ? (
            <button data-testid={NAV.account} onClick={() => navigate("/profile")}
                    className="hidden md:flex items-center justify-center w-10 h-10 rounded-full bg-secondary hover:bg-secondary/80 motion-fast shrink-0"
                    title={customer.name || customer.phone || t(locale, "nav.account")}
                    aria-label={t(locale, "nav.account")}>
              {customer.picture
                ? <img src={customer.picture} alt="" className="w-6 h-6 rounded-full object-cover" />
                : <User size={18} />}
            </button>
          ) : (
            <button
              data-testid="auth-open-login-btn"
              onClick={() => openLogin("/profile")}
              className="hidden md:flex items-center justify-center w-10 h-10 rounded-full bg-secondary hover:bg-secondary/80 motion-fast shrink-0"
              title={t(locale, "nav.login")} aria-label={t(locale, "nav.login")}
            >
              <User size={18} />
            </button>
          )}

          {/* Cart — always visible */}
          <button
            data-testid={NAV.cartButton}
            onClick={() => navigate("/cart")}
            className="relative baked-btn px-2 md:px-3 py-2 bg-secondary hover:bg-secondary/80 motion-fast flex items-center gap-2 shrink-0"
          >
            <ShoppingCart size={18} style={{ color: "#77BC1F" }} />
            <span data-testid={NAV.cartCount} className="absolute -top-1.5 -right-1.5 text-[10px] bg-[hsl(var(--mart))] text-black font-bold rounded-full w-5 h-5 flex items-center justify-center leading-none">
              {cart.item_count || 0}
            </span>
            <span data-testid={NAV.cartTotal} className="hidden lg:inline text-sm font-semibold whitespace-nowrap">
              {formatMoney(cart.subtotal || 0, country?.currency, country?.currency_symbol)}
            </span>
          </button>

          {/* Language switcher — desktop only */}
          <div
            data-testid="top-nav-language-switcher"
            className="hidden lg:flex baked-btn overflow-hidden border border-border items-stretch text-xs font-semibold shrink-0"
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

          {/* Theme toggle — desktop only */}
          <button
            data-testid={NAV.themeToggle}
            onClick={toggleTheme}
            className="hidden lg:flex baked-btn w-10 h-10 items-center justify-center bg-secondary hover:bg-secondary/80 motion-fast shrink-0"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {/* Hamburger — opens the side drawer (visible below lg since language/theme sit there) */}
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <button
                data-testid="topnav-hamburger"
                className="lg:hidden w-10 h-10 rounded-full bg-secondary hover:bg-secondary/80 flex items-center justify-center motion-fast shrink-0"
                aria-label="Open menu"
              >
                <Menu size={20} />
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[86vw] max-w-[380px] p-0 flex flex-col" data-testid="topnav-drawer">
              <SheetHeader className="p-5 border-b border-border">
                <SheetTitle className="flex items-center gap-3">
                  <BakedLogo size="sm" />
                  <span className="text-sm text-muted-foreground">{country?.name || "BAKĒD"}</span>
                </SheetTitle>
                <SheetDescription className="sr-only">Main menu — navigation, account, country, language and theme</SheetDescription>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto">
                {/* Auth block */}
                <div className="p-4 border-b border-border">
                  {customer ? (
                    <button
                      data-testid="drawer-profile"
                      onClick={() => navigate("/profile")}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-secondary motion-fast"
                    >
                      {customer.picture ? (
                        <img src={customer.picture} alt="me" className="w-11 h-11 rounded-full object-cover" />
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center"><User size={20} /></div>
                      )}
                      <div className="text-left">
                        <div className="text-sm font-semibold">{customer.name || t(locale, "nav.account")}</div>
                        <div className="text-[11px] text-muted-foreground">{customer.phone}</div>
                      </div>
                    </button>
                  ) : (
                    <button
                      data-testid="drawer-login"
                      onClick={() => openLogin("/profile")}
                      className="w-full h-11 baked-btn font-semibold bg-primary text-primary-foreground"
                    >
                      {t(locale, "nav.login")}
                    </button>
                  )}
                </div>

                {/* Quick nav */}
                <nav className="p-2">
                  {[
                    { icon: MapPin,       label: t(locale, "nav.categories") || "Categories",   to: "/categories",             testid: "drawer-categories" },
                    { icon: Tag,          label: t(locale, "nav.offers"),                        to: "/products?sort=price_asc", testid: "drawer-offers" },
                    { icon: Package,      label: t(locale, "nav.orders"),                        to: "/orders",                 testid: "drawer-orders" },
                  ].map(({ icon: Icon, label, to, testid }) => (
                    <button
                      key={testid}
                      data-testid={testid}
                      onClick={() => navigate(to)}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-secondary motion-fast text-left"
                    >
                      <Icon size={18} style={{ color: "#77BC1F" }} />
                      <span className="text-sm font-medium">{label}</span>
                    </button>
                  ))}
                </nav>

                <div className="h-px bg-border mx-4 my-2" />

                {/* Country switcher inside the drawer */}
                <div className="p-4">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Country</div>
                  <div className="grid gap-1.5">
                    {countries.map((c) => (
                      <button
                        key={c.code}
                        data-testid={`drawer-country-${c.code}`}
                        onClick={() => { setCountryCode(c.code); setDrawerOpen(false); }}
                        className={`flex items-center gap-3 px-3 py-2 baked-btn text-left ${country?.code === c.code ? "bg-secondary" : "hover:bg-secondary"}`}
                      >
                        <span className="text-xl">{c.flag}</span>
                        <div className="flex-1">
                          <div className="text-sm font-medium">{c.name}</div>
                          <div className="text-[11px] text-muted-foreground">{c.currency} · {c.locale}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Footer: language + theme */}
              <div className="p-4 border-t border-border flex items-center gap-3">
                <div className="baked-btn overflow-hidden border border-border flex items-stretch text-xs font-semibold" role="group" aria-label="Language">
                  <button
                    data-testid="drawer-language-fr"
                    onClick={() => setLanguage("fr")}
                    className={`px-3 py-2 motion-fast ${language === "fr" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground"}`}
                  >FR</button>
                  <div className="w-px bg-border" />
                  <button
                    data-testid="drawer-language-en"
                    onClick={() => setLanguage("en")}
                    className={`px-3 py-2 motion-fast ${language === "en" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground"}`}
                  >EN</button>
                </div>
                <button
                  data-testid="drawer-theme-toggle"
                  onClick={toggleTheme}
                  className="ml-auto w-10 h-10 rounded-lg bg-secondary hover:bg-secondary/80 flex items-center justify-center motion-fast"
                  aria-label="Toggle theme"
                >
                  {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
                </button>
                {customer && (
                  <button
                    data-testid="drawer-logout"
                    onClick={() => { logout(); setDrawerOpen(false); }}
                    className="text-xs px-2 py-1 rounded-lg text-rose-400"
                  >
                    <X size={14} className="inline" /> Sign out
                  </button>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </>
  );
};
