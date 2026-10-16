import React from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';

import { colors, fonts } from '@/theme';

type Weight = keyof typeof fonts;
type Props = TextProps & { weight?: Weight; size?: number; color?: string; align?: TextStyle['textAlign'] };

export function AppText({ weight = 'regular', size = 15, color = colors.text, align, style, ...rest }: Props) {
  return (
    <Text
      {...rest}
      allowFontScaling
      maxFontSizeMultiplier={1.3}
      style={[{ fontFamily: fonts[weight], fontSize: size, color, textAlign: align, lineHeight: size * 1.35 }, style]}
    />
  );
}
