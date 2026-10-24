import { StyleSheet } from 'react-native';

export type Scheme = 'dark' | 'light';

const dark = {
  bg: '#000000',
  surface: '#101012',
  surface2: '#171719',
  surface3: '#1F1F23',
  border: '#26262B',
  borderSoft: '#1C1C20',
  text: '#FFFFFF',
  textSoft: '#E4E4E7',
  textMuted: '#A1A1AA',
  textDim: '#6B6B73',
  muted: '#3A3A40',
  tabBar: '#0B0B0D',
  overlay: 'rgba(0,0,0,0.6)',
  scrim: 'rgba(0,0,0,0.35)',
  shadow: '#000000',
  accent: '#77BC1F',
  danger: '#FF4C52',
  blue: '#1D9BF0',
};

export type Palette = typeof dark;

const light: Palette = {
  bg: '#FFFFFF',
  surface: '#F5F5F5',
  surface2: '#EDEDEE',
  surface3: '#E4E4E6',
  border: '#E5E5E5',
  borderSoft: '#EEEEEE',
  text: '#111111',
  textSoft: '#2A2A2E',
  textMuted: '#666666',
  textDim: '#8A8A8F',
  muted: '#CFCFD4',
  tabBar: '#FFFFFF',
  overlay: 'rgba(0,0,0,0.4)',
  scrim: 'rgba(255,255,255,0.7)',
  shadow: '#9A9AA0',
  accent: '#77BC1F',
  danger: '#E5383F',
  blue: '#1D9BF0',
};

export const PALETTES: Record<Scheme, Palette> = { dark, light };

let current: Scheme = 'dark';
let version = 0;

// Live colour tokens: every read returns the active scheme's value.
export const colors = new Proxy({} as Palette, { get: (_, k: string) => (PALETTES[current] as any)[k] });

export const getScheme = () => current;
export function applyScheme(s: Scheme) {
  if (s === current) return;
  current = s;
  version += 1;
}

// Theme-aware StyleSheet: rebuilt lazily whenever the scheme changes.
export function themed<T extends object>(factory: () => T): T {
  let cache: T | null = null;
  let builtFor = -1;
  return new Proxy({} as T, {
    get: (_, k: string) => {
      if (builtFor !== version || !cache) { cache = StyleSheet.create(factory() as any) as T; builtFor = version; }
      return (cache as any)[k];
    },
  });
}

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  black: 'Inter_800ExtraBold',
};

export const radius = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };

export const hexA = (hex: string, alpha: number) =>
  `${hex}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
