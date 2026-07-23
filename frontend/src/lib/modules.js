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
  { code: "mart", label: "MART", suffix: "bakēd", tagline: "Groceries & Daily Needs", color: "#77BC1F", icon: ShoppingBasket, status: "active", route: "/" },
  { code: "food", label: "FOOD", suffix: "bakēd", tagline: "Restaurants & Food", color: "#77BC1F", icon: Utensils, status: "coming_soon", route: "/food" },
  { code: "shop", label: "SHOP", suffix: "bakēd", tagline: "Electronics & Lifestyle", color: "#FCC44C", icon: ShoppingBag, status: "coming_soon", route: "/shop" },
  { code: "express", label: "EXPRESS", suffix: "bakēd", tagline: "Courier & Delivery", color: "#FCC44C", icon: Truck, status: "active", route: "/express" },
  { code: "auto", label: "AUTO", suffix: "bakēd", tagline: "Vehicles & Services", color: "#FF4C52", icon: Car, status: "coming_soon", route: "/auto" },
  { code: "immo", label: "IMMO", suffix: "bakēd", tagline: "Real Estate & Property", color: "#A659FF", icon: Home, status: "coming_soon", route: "/immo" },
];

export const getModule = (code) => MODULES.find((m) => m.code === code) || MODULES[0];

// BAKĒD brand tokens
export const BRAND = {
  blue: "#1D9BF0",   // Global platform accent
  red: "#FF4C52",    // Brand action / login accent
};
