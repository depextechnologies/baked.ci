import React from 'react';
import { Text } from 'react-native';

import { MODULES, type ModuleCode } from '@/lib/modules';
import { colors, fonts } from '@/theme';

export function BrandName({ code, size = 22, dim = false }: { code: ModuleCode; size?: number; dim?: boolean }) {
  const m = MODULES[code];
  return (
    <Text style={{ fontSize: size, lineHeight: size * 1.15 }} numberOfLines={1} adjustsFontSizeToFit>
      <Text style={{ fontFamily: fonts.black, color: dim ? colors.textDim : m.color, letterSpacing: -0.5 }}>{m.label}</Text>
      <Text style={{ fontFamily: fonts.bold, color: dim ? colors.textDim : colors.text }}>bakēd</Text>
    </Text>
  );
}
