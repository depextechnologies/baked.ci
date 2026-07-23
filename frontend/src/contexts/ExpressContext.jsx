import React, { createContext, useContext, useMemo, useState, useCallback, useEffect } from "react";

/**
 * ExpressBooking context — holds the wizard draft state across screens for the
 * parcel booking flow. Persisted to sessionStorage so a page refresh mid-wizard
 * does not lose progress.
 */
const KEY = "baked_express_draft";
const ExpressBookingCtx = createContext();

const initialDraft = {
  pickup: null,          // { line1, latitude, longitude, place_id, formatted_address, city, country }
  drop: null,
  receiver: {
    name: "",
    phone: "",
    alt_phone: "",
    building: "",
    landmark: "",
    notes: "",
    preferences: [],
  },
  vehicle_code: null,
  package: {
    type: "general",
    weight_range: "wt_upto_5",
    dimensions: { length: "", width: "", height: "" },
    notes: "",
  },
  promo_code: "",
  declared_value: null,
};

export const ExpressBookingProvider = ({ children }) => {
  const [draft, setDraftRaw] = useState(() => {
    try { return { ...initialDraft, ...(JSON.parse(sessionStorage.getItem(KEY)) || {}) }; }
    catch { return initialDraft; }
  });

  const setDraft = useCallback((updater) => {
    setDraftRaw((prev) => {
      const next = typeof updater === "function" ? updater(prev) : { ...prev, ...updater };
      try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch (e) { void e; }
      return next;
    });
  }, []);

  const resetDraft = useCallback(() => {
    setDraftRaw(initialDraft);
    sessionStorage.removeItem(KEY);
  }, []);

  const value = useMemo(() => ({ draft, setDraft, resetDraft }), [draft, setDraft, resetDraft]);
  return <ExpressBookingCtx.Provider value={value}>{children}</ExpressBookingCtx.Provider>;
};

export const useExpressBooking = () => {
  const ctx = useContext(ExpressBookingCtx);
  if (!ctx) throw new Error("useExpressBooking must be used within ExpressBookingProvider");
  return ctx;
};

/**
 * Compute wizard progress from the draft — returns which of 5 steps are
 * completed so the ProgressBar can render checks / current / upcoming.
 */
export const useWizardProgress = () => {
  const { draft } = useExpressBooking();
  return useMemo(() => ({
    location: Boolean(draft.pickup && draft.drop),
    receiver: Boolean(draft.receiver?.name && draft.receiver?.phone),
    vehicle: Boolean(draft.vehicle_code),
    package: Boolean(draft.package?.type && draft.package?.weight_range),
    review: false,
  }), [draft]);
};

/**
 * Movers draft — separate namespace so a customer can have both flows open.
 */
const MOVERS_KEY = "baked_express_movers_draft";
const MoversBookingCtx = createContext();
const initialMovers = {
  move_type: null,
  pickup: null,
  drop: null,
  pickup_building: { lift: false, stairs: false, floor: 0, parking: false, labour_required: false },
  drop_building: { lift: false, stairs: false, floor: 0, parking: false, labour_required: false },
  items: [], // [{item_id, name, qty, base_price, weight_kg}]
  custom_items: [],
  scheduled_date: null,
  time_slot_code: null,
  labour_movers: 2,
  declared_value: null,
  terms_ok: false,
};

export const MoversBookingProvider = ({ children }) => {
  const [draft, setDraftRaw] = useState(() => {
    try { return { ...initialMovers, ...(JSON.parse(sessionStorage.getItem(MOVERS_KEY)) || {}) }; }
    catch { return initialMovers; }
  });
  const setDraft = useCallback((u) => {
    setDraftRaw((prev) => {
      const next = typeof u === "function" ? u(prev) : { ...prev, ...u };
      try { sessionStorage.setItem(MOVERS_KEY, JSON.stringify(next)); } catch (e) { void e; }
      return next;
    });
  }, []);
  const resetDraft = useCallback(() => { setDraftRaw(initialMovers); sessionStorage.removeItem(MOVERS_KEY); }, []);
  const value = useMemo(() => ({ draft, setDraft, resetDraft }), [draft, setDraft, resetDraft]);
  return <MoversBookingCtx.Provider value={value}>{children}</MoversBookingCtx.Provider>;
};
export const useMoversBooking = () => {
  const ctx = useContext(MoversBookingCtx);
  if (!ctx) throw new Error("useMoversBooking must be used within MoversBookingProvider");
  return ctx;
};
