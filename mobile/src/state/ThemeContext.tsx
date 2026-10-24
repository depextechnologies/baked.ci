import * as SystemUI from 'expo-system-ui';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import { api } from '@/lib/api';
import { prefs } from '@/lib/storage';
import { applyScheme, PALETTES, type Scheme } from '@/theme';
import { useSession } from './SessionContext';

export type ThemeMode = 'dark' | 'light' | 'system';
const MODES: ThemeMode[] = ['dark', 'light', 'system'];
const isMode = (m: unknown): m is ThemeMode => MODES.includes(m as ThemeMode);

type ThemeState = { mode: ThemeMode; scheme: Scheme; loaded: boolean; setMode: (m: ThemeMode) => void };
const Ctx = createContext<ThemeState | null>(null);

// Global appearance: device-saved for guests, mirrored to the account preferences when signed in.
export function ThemeModeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const { customer } = useSession();
  const [mode, _setMode] = useState<ThemeMode>('dark');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    prefs.get<ThemeMode>('theme_mode', 'dark').then((m) => { if (isMode(m)) _setMode(m); setLoaded(true); });
  }, []);

  useEffect(() => {
    if (!customer?.id) return;
    api<{ theme?: string }>('/customers/me/preferences')
      .then((p) => { if (isMode(p?.theme)) { _setMode(p.theme); prefs.set('theme_mode', p.theme); } })
      .catch(() => {});
  }, [customer?.id]);

  const scheme: Scheme = mode === 'system' ? (system === 'light' ? 'light' : 'dark') : mode;
  applyScheme(scheme);

  useEffect(() => { SystemUI.setBackgroundColorAsync(PALETTES[scheme].bg).catch(() => {}); }, [scheme]);

  const setMode = useCallback((m: ThemeMode) => {
    _setMode(m);
    prefs.set('theme_mode', m);
    if (customer?.id) {
      api('/customers/me/preferences', { method: 'PATCH', body: { theme: m, dark_mode: m === 'dark' } }).catch(() => {});
    }
  }, [customer?.id]);

  const value = useMemo(() => ({ mode, scheme, loaded, setMode }), [mode, scheme, loaded, setMode]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useThemeMode = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useThemeMode outside ThemeModeProvider');
  return v;
};
