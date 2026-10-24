import { Image } from 'expo-image';
import React from 'react';

import { getScheme } from '@/theme';
import { Touchable } from './ui/Button';

const SRC = require('../../assets/images/logo.png');
const SRC_DARK_TEXT = require('../../assets/images/logo-dark.png');
const RATIO = 1553 / 420;

export function Logo({ height = 34, onPress, testID }: { height?: number; onPress?: () => void; testID?: string }) {
  const img = <Image source={getScheme() === 'light' ? SRC_DARK_TEXT : SRC} style={{ height, width: height * RATIO }} contentFit="contain" accessibilityLabel="BAKĒD" />;
  if (!onPress) return img;
  return <Touchable testID={testID} onPress={onPress} hitSlop={10} accessibilityRole="button">{img}</Touchable>;
}
