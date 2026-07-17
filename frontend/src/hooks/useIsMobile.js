import { useEffect, useState } from "react";

// Central breakpoint for "switch to mobile web experience" (per PRD spec).
export const MOBILE_MAX = 768;

export const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(() => (typeof window !== "undefined" ? window.innerWidth < MOBILE_MAX : false));
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_MAX - 1}px)`);
    const listener = (e) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    if (mq.addEventListener) mq.addEventListener("change", listener);
    else mq.addListener(listener);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", listener);
      else mq.removeListener(listener);
    };
  }, []);
  return isMobile;
};
