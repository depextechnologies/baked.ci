import React from "react";
import { Minus, Plus } from "lucide-react";

/**
 * QuantityStepper — [-] N [+] used on cart, product detail, mobile product cards.
 */
export const QuantityStepper = ({ value, onDecrement, onIncrement, size = "md", min = 0, testid = "qty", accent = "#77BC1F" }) => {
  const H = size === "sm" ? "h-8" : size === "lg" ? "h-11" : "h-9";
  const btn = `flex items-center justify-center ${H} aspect-square rounded-lg motion-fast active:scale-95`;
  return (
    <div className={`inline-flex items-center gap-1 ${H}`} data-testid={testid}>
      <button data-testid={`${testid}-dec`} disabled={value <= min} onClick={onDecrement} className={`${btn} bg-secondary hover:bg-secondary/70 disabled:opacity-40`} aria-label="Decrement">
        <Minus size={size === "lg" ? 16 : 13} />
      </button>
      <div className={`min-w-[36px] text-center font-bold ${size === "lg" ? "text-base" : "text-sm"}`} data-testid={`${testid}-value`}>{value}</div>
      <button data-testid={`${testid}-inc`} onClick={onIncrement} className={`${btn} text-black`} style={{ backgroundColor: accent }} aria-label="Increment">
        <Plus size={size === "lg" ? 16 : 13} />
      </button>
    </div>
  );
};
