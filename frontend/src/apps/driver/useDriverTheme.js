/**
 * useDriverTheme — lightweight theme toggle for the SENDbakēd Driver PWA.
 *
 * Mirrors the customer app's approach (see contexts/BakedContexts.jsx):
 *   • Persists to localStorage under `baked_driver_theme`
 *   • Toggles the `.dark` class on <html> so Tailwind's semantic tokens
 *     (bg-background, text-foreground, bg-card, border-border, …)
 *     automatically resolve for both modes.
 *
 * The driver PWA lives outside the customer AppProvider, so it maintains
 * its own preference — but the CSS token cascade is shared, so a driver
 * switching to Light and then navigating out to /send/track/... will still
 * see the same theme (which is desirable).
 */
import { useCallback, useEffect, useState } from "react";

const KEY = "baked_driver_theme";

const readInitial = () => {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem(KEY);
  if (stored === "dark" || stored === "light") return stored;
  // Default to dark to preserve the current PWA experience for existing drivers.
  return "dark";
};

export const useDriverTheme = () => {
  const [theme, setTheme] = useState(readInitial);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem(KEY, theme);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  return { theme, toggle, setTheme };
};

export default useDriverTheme;
