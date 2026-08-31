import React from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  Search, Bell, Menu, User, Sun, Moon, LogOut, X,
  Store, Package, Truck, Info, Newspaper, Tag, HelpCircle, MessageCircle,
} from "lucide-react";
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

// Fixed order per Fixing_Prompt.docx (2026-02).
const DRAWER_LINKS = [
  { label: "Partner with BAKĒD", to: "/partner",              icon: Store,        testid: "m-drawer-partner" },
  { label: "Sell on BAKĒD",      to: "/Sell-on-baked",        icon: Package,      testid: "m-drawer-sell" },
  { label: "Delivery Partner",   to: "/driver",               icon: Truck,        testid: "m-drawer-delivery-partner" },
  { label: "About us",           to: "/about",                icon: Info,         testid: "m-drawer-about" },
  { label: "Blog",               to: "/blog",                 icon: Newspaper,    testid: "m-drawer-blog" },
  { label: "Offers",             to: "/products?sort=price_asc", icon: Tag,       testid: "m-drawer-offers" },
  { label: "Help Center",        to: "/help",                 icon: HelpCircle,   testid: "m-drawer-help" },
  { label: "Contact us",         to: "/contact",              icon: MessageCircle,testid: "m-drawer-contact" },
];

/**
 * MobileHeader — top bar for mobile customer surfaces.
 * Row 1 (left → right):  ☰   BAKĒD-logo   DELIVER-TO/address   🔔
 * Row 2 (home only):     search pill
 * Hamburger opens a LEFT-side drawer per Fixing_Prompt.docx (2026-02).
 * Auto-closes on route change (Social.docx §12).
 */
export const MobileHeader = ({ variant = "home", title }) => {
  const { country, language, countries, setCountryCode, theme, toggleTheme, setLanguage } = useApp();
  const { customer, logout, openLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const locale = `${language}-${country?.code || "CI"}`;
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  React.useEffect(() => { setDrawerOpen(false); }, [location.pathname, location.search]);

  const goto = (to) => { setDrawerOpen(false); navigate(to); };

  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border">
      {/* Row 1 —  ☰  Logo  DELIVER-TO / address  🔔  */}
      <div className="px-3 pt-2.5 pb-2 flex items-center gap-2">
        {/* A. Hamburger — 44×44 tap target, far left */}
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetTrigger asChild>
            <button
              data-testid="m-header-menu"
              className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center hover:bg-secondary motion-fast"
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-[86vw] max-w-[380px] p-0 flex flex-col"
            data-testid="m-header-drawer"
          >
            {/* Drawer header with brand + close */}
            <SheetHeader className="p-5 border-b border-border relative">
              <SheetTitle className="flex items-center gap-3 pr-8">
                <BakedLogo size="sm" />
                <span className="text-sm text-muted-foreground truncate">{country?.name || "BAKĒD"}</span>
              </SheetTitle>
              <SheetDescription className="sr-only">Main menu — navigation, country, language and theme</SheetDescription>
              <button
                data-testid="m-drawer-close"
                onClick={() => setDrawerOpen(false)}
                className="absolute top-3 right-3 w-9 h-9 rounded-lg flex items-center justify-center hover:bg-secondary motion-fast"
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto">
              {/* Auth chip */}
              <div className="p-4 border-b border-border">
                {customer ? (
                  <button
                    data-testid="m-drawer-profile"
                    onClick={() => goto("/profile")}
                    className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-secondary motion-fast"
                  >
                    {customer.picture ? (
                      <img src={customer.picture} alt="me" className="w-11 h-11 rounded-full object-cover" />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-secondary flex items-center justify-center"><User size={20} /></div>
                    )}
                    <div className="text-left min-w-0">
                      <div className="text-sm font-semibold truncate">{customer.name || "Account"}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{customer.phone}</div>
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

              {/* Ordered main nav — Partner → Sell → Delivery → About → Blog → Offers → Help → Contact */}
              <nav className="p-2">
                {DRAWER_LINKS.map(({ icon: Icon, label, to, testid }) => (
                  <button
                    key={testid}
                    data-testid={testid}
                    onClick={() => goto(to)}
                    className="w-full flex items-center gap-3 px-3 py-3.5 rounded-lg hover:bg-secondary motion-fast text-left"
                  >
                    <Icon size={18} style={{ color: "#77BC1F" }} />
                    <span className="text-[15px] font-medium">{label}</span>
                  </button>
                ))}
              </nav>

              <div className="h-px bg-border mx-4 my-2" />

              {/* Country Selector */}
              <div className="p-4">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Country Selector</div>
                <div className="grid gap-1.5">
                  {countries.map((c) => (
                    <button
                      key={c.code}
                      data-testid={`m-drawer-country-${c.code}`}
                      onClick={() => { setCountryCode(c.code); setDrawerOpen(false); }}
                      className={`flex items-center gap-3 px-3 py-2 baked-btn text-left ${country?.code === c.code ? "bg-secondary" : "hover:bg-secondary"}`}
                    >
                      <span className="text-xl">{c.flag}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{c.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">{c.currency} · {c.locale}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer: Language Selector | Theme toggle */}
            <div className="p-4 border-t border-border">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Language / Theme</div>
              <div className="flex items-center gap-3">
                <div className="baked-btn overflow-hidden border border-border flex items-stretch text-xs font-semibold flex-1" role="group" aria-label="Language Selector">
                  <button
                    data-testid="m-drawer-language-fr"
                    onClick={() => setLanguage("fr")}
                    className={`flex-1 px-3 py-2 motion-fast ${language === "fr" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground"}`}
                  >FR</button>
                  <div className="w-px bg-border" />
                  <button
                    data-testid="m-drawer-language-en"
                    onClick={() => setLanguage("en")}
                    className={`flex-1 px-3 py-2 motion-fast ${language === "en" ? "bg-primary text-primary-foreground" : "bg-transparent text-muted-foreground"}`}
                  >EN</button>
                </div>
                <button
                  data-testid="m-drawer-theme-toggle"
                  onClick={toggleTheme}
                  className="w-11 h-11 rounded-lg bg-secondary hover:bg-secondary/80 flex items-center justify-center motion-fast"
                  aria-label="Toggle theme"
                >
                  {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
                </button>
              </div>
              {customer && (
                <button
                  data-testid="m-drawer-logout"
                  onClick={() => { logout(); setDrawerOpen(false); }}
                  className="mt-3 w-full text-xs px-3 py-2 rounded-lg text-rose-400 flex items-center justify-center gap-1 hover:bg-secondary motion-fast"
                >
                  <LogOut size={12} /> Sign out
                </button>
              )}
            </div>
          </SheetContent>
        </Sheet>

        {/* B. BAKĒD Logo */}
        <Link to="/" data-testid="m-header-logo" className="shrink-0 pr-1">
          <BakedLogo size="sm" />
        </Link>

        {/* C. Deliver-to address — flexible middle, truncates on narrow phones */}
        <div className="flex-1 min-w-0">
          <AddressPill variant="mobile" testid="m-header-address" />
        </div>

        {/* D. Notification bell — 44×44 tap target, far right */}
        <button
          data-testid="m-header-notifications"
          className="shrink-0 relative w-11 h-11 rounded-xl flex items-center justify-center hover:bg-secondary motion-fast"
          aria-label="Notifications"
        >
          <Bell size={20} />
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full" style={{ backgroundColor: "#FF4C52" }} />
        </button>
      </div>

      {/* Row 2 — search (home) or page title */}
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
