import { Image } from 'expo-image';
import React from 'react';
import { Text, View } from 'react-native';

import { MODULES, type ModuleCode } from '@/lib/modules';
import { accentText, colors, fonts, getScheme } from '@/theme';

// Official dark-mode wordmarks (b-badge + coloured name, transparent background).
const DARK_LOGO: Partial<Record<ModuleCode, number>> = {
  food: require('../../assets/images/brand/bfood-dark.png'),
  mart: require('../../assets/images/brand/bmart-dark.png'),
  express: require('../../assets/images/brand/bsend-dark.png'),
  shop: require('../../assets/images/brand/bshop-dark.png'),
};
const BADGE = { dark: require('../../assets/images/brand/badge-on-dark.png'), light: require('../../assets/images/brand/badge-on-light.png') };
const RATIO = 900 / 253;

export const brandName = (code: ModuleCode) => `b${MODULES[code].label}`;

// Module wordmark: official logo in dark mode; text logo (b-badge + name in module colour) otherwise.
export function BrandName({ code, size = 22, dim = false }: { code: ModuleCode; size?: number; dim?: boolean }) {
  const m = MODULES[code];
  const h = Math.round(size * 1.15);
  const scheme = getScheme();
  const logo = DARK_LOGO[code];
  if (scheme === 'dark' && logo && !dim) {
    return <Image source={logo} style={{ height: h, width: h * RATIO }} contentFit="contain" accessibilityLabel={brandName(code)} testID={`brand-logo-${code}`} />;
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: h * 0.18, opacity: dim ? 0.55 : 1 }} accessibilityLabel={brandName(code)} testID={`brand-text-${code}`}>
      <Image source={scheme === 'dark' ? BADGE.dark : BADGE.light} style={{ height: h, width: h }} contentFit="contain" />
      <Text style={{ fontFamily: fonts.black, fontSize: size, lineHeight: h, color: dim ? colors.textDim : accentText(m.color), letterSpacing: -0.3 }} numberOfLines={1}>{m.label}</Text>
    </View>
  );
}
