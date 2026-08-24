import React from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Search, Wallet2, Bell, Menu, User, Package, Tag, Settings2, Sun, Moon, Grid3x3, MapPin as MapPinIcon, LogOut } from "lucide-react";
import { useApp, useAuth } from "../../contexts/BakedContexts";
import { BakedLogo } from "../layout/BakedLogo";
import { t } from "../../lib/i18n";
import { AddressPill } from "../address/AddressPill";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle, SheetDescription } from "../ui/sheet";

// t() returns the raw key when missing — helper to gracefully fall back.
const tOr = (locale, key, fallback) => {
  const v = t(locale, key);
  return v && v !== key ? v : fallback;
};

/**
 * MobileHeader — replicates the mobile app top bar:
 *   Row 1: BAKĒD logo (compact) · Address pill · Wallet · Notifications · Menu
 *   Row 2: Search bar
 * Sticky by default; participates in the mobile shell. The hamburger opens a
 * right-side drawer that auto-closes on route change (Social.docx §12).
 */
export const MobileHeader = ({ variant = "home", title }) => {
  const { country, language, countries, setCountryCode, theme, toggleTheme, setLanguage } = useApp();
  const { customer, logout, openLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const locale = `${language}-${country?.code || "CI"}`;
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // Auto-close the drawer on any route change (Social.docx §12)
  React.useEffect(() => { setDrawerOpen(false); }, [location.pathname, location.search]);

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

        {/* Hamburger — opens right-side drawer */}
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetTrigger asChild>
            <button
              data-testid="m-header-menu"
              className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-secondary hover:bg-secondary/80 motion-fast"
              aria-label="Open menu"
            >
              <Menu size={16} />
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[86vw] max-w-[380px] p-0 flex flex-col" data-testid="m-header-drawer">
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
                    data-testid="m-drawer-profile"
                    onClick={() => navigate("/profile")}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-secondary motion-fast"
                  >
                    {customer.picture ? (
                      <img src={customer.picture} alt="me" className="w-11 h-11 rounded-full object-cover" />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center"><User size={20} /></div>
                    )}
                    <div className="text-left">
                      <div className="text-sm font-semibold">{customer.name || "Account"}</div>
                      <div className="text-[11px] text-muted-foreground">{customer.phone}</div>
                    </div>
                  </button>
                ) : (
                  <button
                    data-testid="m-drawer-login"
                    onClick={() => openLogin("/profile")}
                    className="w-full h-11 baked-btn font-semibold bg-primary text-primary-foreground"
                  >
                    {tOr(locale, "nav.login", "Login")}
                  </button>
                )}
              </div>

              {/* Quick nav */}
              <nav className="p-2">
                {[
                  { icon: Grid3x3,   label: tOr(locale, "nav.categories", "Categories"), to: "/categories",              testid: "m-drawer-categories" },
                  { icon: Tag,       label: tOr(locale, "nav.offers", "Offers"),          to: "/products?sort=price_asc", testid: "m-drawer-offers" },
                  { icon: Package,   label: tOr(locale, "nav.orders", "Orders"),          to: "/orders",                  testid: "m-drawer-orders" },
                  { icon: MapPinIcon,label: tOr(locale, "nav.addresses", "Addresses"),    to: "/addresses",               testid: "m-drawer-addresses" },
                  { icon: Wallet2,   label: tOr(locale, "nav.wallet", "Wallet"),          to: "/wallet",                  testid: "m-drawer-wallet" },
                  { icon: Settings2, label: tOr(locale, "nav.settings", "Settings"),      to: "/settings",                testid: "m-drawer-settings" },
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

              {/* Country switcher */}
              <div className="p-4">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Country</div>
                <div className="grid gap-1.5">
                  {countries.map((c) => (
                    <button
                      key={c.code}
                      data-testid={`m-drawer-country-${c.code}`}
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

            {/* Footer: language + theme + logout */}
            <div className="p-4 border-t border-border flex items-center gap-3">
              <div className="baked-btn overflow-hidden border border-border flex items-stretch text-xs font-semibold" role="group" aria-label="Language">
                <button
                  data-testid="m-drawer-language-fr"
                  onClick={() => setLanguage("fr")}
                  className={`px-3 py-2 motion-fast ${language === "fr" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground"}`}
                >FR</button>
                <div className="w-px bg-border" />
                <button
                  data-testid="m-drawer-language-en"
                  onClick={() => setLanguage("en")}
                  className={`px-3 py-2 motion-fast ${language === "en" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground"}`}
                >EN</button>
              </div>
              <button
                data-testid="m-drawer-theme-toggle"
                onClick={toggleTheme}
                className="w-10 h-10 rounded-lg bg-secondary hover:bg-secondary/80 flex items-center justify-center motion-fast"
                aria-label="Toggle theme"
              >
                {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              {customer && (
                <button
                  data-testid="m-drawer-logout"
                  onClick={() => { logout(); setDrawerOpen(false); }}
                  className="ml-auto text-xs px-2 py-1 rounded-lg text-rose-400 flex items-center gap-1"
                >
                  <LogOut size={12} /> Sign out
                </button>
              )}
            </div>
          </SheetContent>
        </Sheet>
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
