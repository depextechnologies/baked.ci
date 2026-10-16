export const colors = {
  bg: '#000000',
  surface: '#0E0E10',
  surface2: '#16161A',
  border: '#232328',
  borderSoft: '#1A1A1F',
  text: '#FFFFFF',
  textMuted: '#A1A1AA',
  textDim: '#6B6B73',
  accent: '#77BC1F',
  danger: '#FF4C52',
  blue: '#1D9BF0',
};

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
