import { ShoppingBag, type LucideIcon } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, hexA, themed } from '@/theme';
import { SafeImage } from '../ui/SafeImage';

// Product image with a branded icon fallback when the URL is missing or keeps failing to load.
export function Thumb({ src, color, icon: Icon = ShoppingBag, size = 34, testID }: { src?: string | null; color: string; icon?: LucideIcon; size?: number; testID?: string }) {
  const fallback = (
    <View style={[StyleSheet.absoluteFill, styles.fb, { backgroundColor: hexA(color, 0.1) }]} testID={testID ? `${testID}-fallback` : undefined}>
      <Icon color={hexA(color, 0.8)} size={size} />
    </View>
  );
  return <SafeImage source={src} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} testID={testID} fallback={fallback} />;
}

const styles = themed(() => StyleSheet.create({ fb: { alignItems: 'center', justifyContent: 'center', borderColor: colors.border } }));
