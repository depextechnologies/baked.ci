import { Image } from 'expo-image';
import { ShoppingBag, type LucideIcon } from 'lucide-react-native';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, hexA, themed } from '@/theme';

// Product image with a branded icon fallback when the URL is missing or fails to load.
export function Thumb({ src, color, icon: Icon = ShoppingBag, size = 34, testID }: { src?: string | null; color: string; icon?: LucideIcon; size?: number; testID?: string }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) return <Image source={src} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} onError={() => setFailed(true)} testID={testID} />;
  return (
    <View style={[StyleSheet.absoluteFill, styles.fb, { backgroundColor: hexA(color, 0.1) }]} testID={testID ? `${testID}-fallback` : undefined}>
      <Icon color={hexA(color, 0.8)} size={size} />
    </View>
  );
}

const styles = themed(() => StyleSheet.create({ fb: { alignItems: 'center', justifyContent: 'center', borderColor: colors.border } }));
