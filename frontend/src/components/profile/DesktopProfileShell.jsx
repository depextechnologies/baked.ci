import React from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { User as UserIcon, Wallet2, ClipboardList, MapPin, Gift, Users2, LifeBuoy, Settings2, Moon, Sun, LogOut } from "lucide-react";
import { useAuth } from "../../contexts/BakedContexts";

const NAV = [
  { to: "/profile", label: "Profile", icon: UserIcon, end: true },
  { to: "/wallet", label: "Wallet", icon: Wallet2 },
  { to: "/profile/activities", label: "Activities", icon: ClipboardList },
  { to: "/profile/addresses", label: "Addresses", icon: MapPin },
  { to: "/profile/rewards", label: "BAKĒD Rewards", icon: Gift },
  { to: "/profile/refer", label: "Refer & Earn", icon: Users2 },
  { to: "/profile/help", label: "Help & Support", icon: LifeBuoy },
  { to: "/profile/settings", label: "Settings", icon: Settings2 },
];

/**
 * DesktopProfileShell — 2-column layout used on tablet & desktop (≥768px).
 * Left: persistent sidebar with Profile navigation.
 * Right: children (the selected profile page). Content updates in-place via nested React routes.
 */
export const DesktopProfileShell = ({ children }) => {
  const nav = useNavigate();
  const loc = useLocation();
  const { customer, logout } = useAuth();
  const [dark, setDark] = React.useState(() => document.documentElement.classList.contains("dark") || !document.documentElement.classList.contains("light"));

  // Guest → save the intended return path so login can restore it
  React.useEffect(() => {
    if (!customer) sessionStorage.setItem("baked_post_login", loc.pathname);
  }, [customer, loc.pathname]);

  const toggleTheme = () => {
    const root = document.documentElement;
    const now = !dark;
    root.classList.toggle("dark", now);
    root.classList.toggle("light", !now);
    setDark(now);
  };

  if (!customer) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-16 text-center">
        <UserIcon size={40} className="mx-auto text-muted-foreground mb-3" />
        <div className="text-2xl font-bold">Sign in to view your profile</div>
        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">Your BAKĒD identity works across MART, FOOD, SHOP, EXPRESS, AUTO and IMMO. Use the login button in the top navigation to continue.</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1500px] mx-auto px-6 py-6">
      <div className="grid grid-cols-[260px_1fr] gap-6 min-h-[calc(100vh-160px)]">
        {/* Sidebar */}
        <aside className="baked-card bg-card border border-border p-3 h-fit sticky top-24">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground px-3 pt-1 pb-2">Profile</div>
          <nav className="flex flex-col gap-0.5">
            {NAV.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  data-testid={`d-prof-nav-${item.label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
                  className={({ isActive }) =>
                    `relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium motion-fast ${isActive ? "bg-[#1D9BF014] text-[#1D9BF0]" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"}`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-full" style={{ backgroundColor: "#1D9BF0" }} />}
                      <Icon size={16} style={isActive ? { color: "#1D9BF0" } : {}} />
                      <span>{item.label}</span>
                    </>
                  )}
                </NavLink>
              );
            })}
          </nav>

          <div className="h-px bg-border my-3" />

          {/* Dark mode toggle */}
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: "#1D9BF014", color: "#1D9BF0" }}>{dark ? <Moon size={14} /> : <Sun size={14} />}</div>
            <span className="flex-1 text-sm font-medium">Dark Mode</span>
            <button data-testid="d-prof-dark" onClick={toggleTheme} role="switch" aria-checked={dark} className={`relative w-10 h-6 rounded-full motion-fast ${dark ? "bg-[#1D9BF0]" : "bg-secondary"}`}>
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white motion-fast ${dark ? "translate-x-4" : ""}`} />
            </button>
          </div>

          {/* Logout */}
          <button
            data-testid="d-prof-logout"
            onClick={() => { logout(); nav("/"); }}
            className="mt-2 w-full flex items-center justify-center gap-2 h-11 rounded-xl border border-red-500/40 text-red-500 font-semibold motion-fast hover:bg-red-500/10"
          >
            <LogOut size={14} /> Log out
          </button>
        </aside>

        {/* Content */}
        <section className="baked-card bg-background border border-border p-0 overflow-hidden desktop-profile-content">
          {children}
        </section>
      </div>
    </div>
  );
};
