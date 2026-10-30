import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

import type { PickedAddress } from '@/lib/places';

// In-progress SEND booking (route points) shared by the booking screen and the address picker.
type Draft = {
  pickup: PickedAddress | null; drops: (PickedAddress | null)[];
  setPoint: (key: string, a: PickedAddress) => void; addStop: () => void; removeStop: (i: number) => void; reset: () => void;
};

const Ctx = createContext<Draft | null>(null);

export function SendDraftProvider({ children }: { children: React.ReactNode }) {
  const [pickup, setPickup] = useState<PickedAddress | null>(null);
  const [drops, setDrops] = useState<(PickedAddress | null)[]>([null]);

  const setPoint = useCallback((key: string, a: PickedAddress) => {
    if (key === 'pickup') setPickup(a);
    else setDrops((d) => d.map((x, i) => (`drop:${i}` === key ? a : x)));
  }, []);
  const addStop = useCallback(() => setDrops((d) => (d.length < 8 ? [...d, null] : d)), []);
  const removeStop = useCallback((i: number) => setDrops((d) => (d.length > 1 ? d.filter((_, j) => j !== i) : d)), []);
  const reset = useCallback(() => { setPickup(null); setDrops([null]); }, []);

  const value = useMemo(() => ({ pickup, drops, setPoint, addStop, removeStop, reset }), [pickup, drops, setPoint, addStop, removeStop, reset]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useSendDraft = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSendDraft outside provider');
  return v;
};
