// BAKĒD module registry — mirrors backend /config/modules but kept locally for instant paint.
import {
  ShoppingBasket,
  Utensils,
  ShoppingBag,
  Truck,
  Car,
  Home,
} from "lucide-react";

export const MODULES = [
  { code: "mart", label: "MART", tagline: "Groceries & Daily Needs", color: "#77BC1F", icon: ShoppingBasket, status: "active", route: "/" },
  { code: "food", label: "FOOD", tagline: "Restaurants & Food", color: "#F26924", icon: Utensils, status: "active", route: "/food" },
  { code: "shop", label: "SHOP", tagline: "Electronics & Lifestyle", color: "#1D9BF0", icon: ShoppingBag, status: "active", route: "/shop" },
  // Note: internal code stays `express` to avoid schema/API churn; user-facing brand is SEND (bSEND).
  { code: "express", label: "SEND", tagline: "Courier & Delivery", color: "#FCC44C", icon: Truck, status: "active", route: "/send" },
  { code: "auto", label: "AUTO", tagline: "Vehicles & Services", color: "#FF4C52", icon: Car, status: "coming_soon", route: "/auto" },
  { code: "immo", label: "IMMO", tagline: "Real Estate & Property", color: "#A659FF", icon: Home, status: "coming_soon", route: "/immo" },
];

// Display name: b + label (bMART, bFOOD, bSHOP, bSEND, bIMMO, bAUTO).
export const brandName = (code) => `b${getModule(code).label}`;

export const getModule = (code) => MODULES.find((m) => m.code === code) || MODULES[0];

// BAKĒD brand tokens
export const BRAND = {
  blue: "#1D9BF0",   // Global platform accent
  red: "#FF4C52",    // Brand action / login accent
};
