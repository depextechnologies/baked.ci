import { Image } from 'expo-image';
import React from 'react';

import { MODULES, type ModuleCode } from '@/lib/modules';
import { getScheme } from '@/theme';

// Official supplied assets: square "b" icon + module name, per background.
const LOGO: Record<'dark' | 'light', Record<ModuleCode, number>> = {
  dark: {
    express: require('../../assets/images/brand/bsend-dark.png'),
    food: require('../../assets/images/brand/bfood-dark.png'),
    mart: require('../../assets/images/brand/bmart-dark.png'),
    shop: require('../../assets/images/brand/bshop-dark.png'),
    immo: require('../../assets/images/brand/bimmo-dark.png'),
    auto: require('../../assets/images/brand/bauto-dark.png'),
  },
  light: {
    express: require('../../assets/images/brand/bsend-light.png'),
    food: require('../../assets/images/brand/bfood-light.png'),
    mart: require('../../assets/images/brand/bmart-light.png'),
    shop: require('../../assets/images/brand/bshop-light.png'),
    immo: require('../../assets/images/brand/bimmo-light.png'),
    auto: require('../../assets/images/brand/bauto-light.png'),
  },
};
// Icon-only square (cropped from the same official files).
const ICON = { dark: require('../../assets/images/brand/badge-on-dark.png'), light: require('../../assets/images/brand/badge-on-light.png') };
const RATIO = 900 / 253;
const ICON_RATIO = 255 / 253;
const SIZES = { small: 16, medium: 22, large: 30 } as const;
const BY_NAME: Record<string, ModuleCode> = { SEND: 'express', EXPRESS: 'express', FOOD: 'food', MART: 'mart', SHOP: 'shop', IMMO: 'immo', AUTO: 'auto' };

export type ModuleLogoProps = {
  module: ModuleCode | string;
  variant?: 'dark' | 'light';
  size?: keyof typeof SIZES | number;
  showName?: boolean;
  dim?: boolean;
  testID?: string;
};

const toCode = (m: string): ModuleCode => (m in MODULES ? (m as ModuleCode) : BY_NAME[m.toUpperCase()] || 'mart');

// The one module logo used across the app; variant follows the active theme unless forced.
export function ModuleLogo({ module, variant, size = 'medium', showName = true, dim = false, testID }: ModuleLogoProps) {
  const code = toCode(module);
  const v = variant || (getScheme() === 'light' ? 'light' : 'dark');
  const h = typeof size === 'number' ? size : SIZES[size];
  const label = `b${MODULES[code].label}`;
  return (
    <Image
      source={showName ? LOGO[v][code] : ICON[v]}
      style={{ height: h, width: h * (showName ? RATIO : ICON_RATIO), opacity: dim ? 0.55 : 1 }}
      contentFit="contain"
      accessibilityLabel={label}
      testID={testID || `brand-logo-${code}`}
    />
  );
}
