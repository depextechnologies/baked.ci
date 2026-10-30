import React, { createContext, useContext } from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';

import { colors, fonts } from '@/theme';

type Weight = keyof typeof fonts;
type Props = TextProps & { weight?: Weight; size?: number; color?: string; align?: TextStyle['textAlign'] };

// Text placed on photos / dark artwork stays white in every theme.
const OnDarkCtx = createContext(false);
export const OnDark = ({ children }: { children: React.ReactNode }) => <OnDarkCtx.Provider value>{children}</OnDarkCtx.Provider>;
export const useOnDark = () => useContext(OnDarkCtx);

export function AppText({ weight = 'regular', size = 15, color, align, style, ...rest }: Props) {
  const onDark = useContext(OnDarkCtx);
  return (
    <Text
      {...rest}
      allowFontScaling
      maxFontSizeMultiplier={1.3}
      style={[{ fontFamily: fonts[weight], fontSize: size, color: color ?? (onDark ? '#FFFFFF' : colors.text), textAlign: align, lineHeight: size * 1.35 }, style]}
    />
  );
}
