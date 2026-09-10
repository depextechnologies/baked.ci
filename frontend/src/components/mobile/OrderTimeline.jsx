import React from "react";
import { Check, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

const TIMELINE_KEY = {
  placed: "timeline_placed",
  preparing: "timeline_preparing",
  picked_up: "timeline_picked_up",
  on_the_way: "timeline_on_the_way",
  delivered: "timeline_delivered",
};

/**
 * OrderTimeline — vertical stepper used on confirmation, tracking and delivered screens.
 * Each stage shows: dot (completed/current/upcoming) + label + timestamp.
 */
export const OrderTimeline = ({ timeline = [], stage, tone = "#77BC1F" }) => {
  const { t } = useTranslation("customer");
  const isPast = (i) => timeline[i]?.completed;
  const isCurrent = (code, i) => timeline[i]?.completed && (i === timeline.length - 1 || !timeline[i + 1]?.completed) && stage !== "delivered" ? true : (!timeline[i]?.completed && (i === 0 || timeline[i - 1]?.completed));
  const label = (step) => {
    const k = TIMELINE_KEY[step.code];
    return k ? t(`orders.tracking.${k}`) : step.label;
  };
  return (
    <ol className="relative">
      {timeline.map((step, i) => {
        const done = isPast(i);
        const now = !done && isCurrent(step.code, i);
        const upcoming = !done && !now;
        return (
          <li key={step.code} className="flex gap-3 relative pb-4 last:pb-0">
            {/* connector */}
            {i < timeline.length - 1 && (
              <span className="absolute left-3 top-6 bottom-0 w-px" style={{ backgroundColor: done ? tone : "hsl(var(--border))" }} />
            )}
            {/* dot */}
            <span className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 z-10" style={{
              backgroundColor: done ? tone : now ? "#FCC44C" : "hsl(var(--secondary))",
              color: done ? "#0a1200" : now ? "#0a1200" : "hsl(var(--muted-foreground))",
            }}>
              {done ? <Check size={13} strokeWidth={3} /> : now ? <Loader2 size={13} className="animate-spin" /> : <span className="w-1.5 h-1.5 rounded-full bg-current" />}
            </span>
            <div className="flex-1 pt-0.5">
              <div className={`text-sm font-semibold ${upcoming ? "text-muted-foreground" : ""}`}>{label(step)}</div>
              <div className="text-[10px] text-muted-foreground">{step.at ? new Date(step.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : (now ? t("orders.tracking.in_progress") : t("orders.tracking.pending"))}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
};
