import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { apiSession, api } from '@/lib/api';
import { DEFAULT_COUNTRY } from '@/lib/config';
import { translate, type Lang, type TKey } from '@/lib/i18n';
import type { ActiveContext } from '@/lib/modules';
import type { PickedAddress } from '@/lib/places';
import { prefs } from '@/lib/storage';

export type Country = {
  code: string; name: string; currency: string; currency_symbol: string;
  phone_code: string; delivery_eta_min?: string; service_radius_km?: number;
};

type AppState = {
  hydrated: boolean;
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TKey, vars?: Record<string, string | number>) => string;
  onboardingDone: boolean;
  completeOnboarding: () => void;
  activeContext: ActiveContext;
  setActiveContext: (c: ActiveContext) => void;
  address: PickedAddress | null;
  setAddress: (a: PickedAddress | null) => void;
  country: Country | null;
};

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [lang, _setLang] = useState<Lang>('fr');
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [activeContext, _setActiveContext] = useState<ActiveContext>('baked');
  const [address, _setAddress] = useState<PickedAddress | null>(null);
  const [country, setCountry] = useState<Country | null>(null);

  useEffect(() => {
    (async () => {
      const [l, ob, ctx, addr] = await Promise.all([
        prefs.get<Lang>('language', 'fr'),
        prefs.get<boolean>('onboarding_done', false),
        prefs.get<ActiveContext>('active_context', 'baked'),
        prefs.get<PickedAddress | null>('active_address', null),
      ]);
      _setLang(l); apiSession.setLanguage(l);
      setOnboardingDone(ob); _setActiveContext(ctx); _setAddress(addr);
      setHydrated(true);
    })();
  }, []);

  const countryCode = address?.country || DEFAULT_COUNTRY;
  useEffect(() => {
    api<Country[]>('/config/countries', { auth: false })
      .then((list) => setCountry(list.find((c) => c.code === countryCode) || list[0] || null))
      .catch(() => setCountry(null));
  }, [countryCode]);

  const setLang = useCallback((l: Lang) => { _setLang(l); apiSession.setLanguage(l); prefs.set('language', l); }, []);
  const completeOnboarding = useCallback(() => { setOnboardingDone(true); prefs.set('onboarding_done', true); }, []);
  const setActiveContext = useCallback((c: ActiveContext) => { _setActiveContext(c); prefs.set('active_context', c); }, []);
  const setAddress = useCallback((a: PickedAddress | null) => {
    _setAddress(a);
    if (a) prefs.set('active_address', a); else prefs.remove('active_address');
  }, []);
  const t = useCallback((key: TKey, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang]);

  const value = useMemo(() => ({
    hydrated, lang, setLang, t, onboardingDone, completeOnboarding,
    activeContext, setActiveContext, address, setAddress, country,
  }), [hydrated, lang, setLang, t, onboardingDone, completeOnboarding, activeContext, setActiveContext, address, setAddress, country]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useApp = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
};
