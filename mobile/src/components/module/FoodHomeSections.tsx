import React from 'react';
import { StyleSheet, View } from 'react-native';

import { MODULES } from '@/lib/modules';
import { useApp } from '@/state/AppContext';
import { useCart, type FoodMode } from '@/state/CartContext';
import { Chip } from '../ui/Chip';
import { themed } from '@/theme';

const GREEN = MODULES.food.color;

export function FoodModeToggle() {
  const { t } = useApp();
  const { foodMode, setFoodMode } = useCart();
  return (
    <View style={styles.modes} testID="food-mode-toggle">
      {(['delivery', 'pickup', 'dine_in'] as FoodMode[]).map((m) => (
        <Chip key={m} testID={`food-mode-${m}`} label={t(`mode.${m}` as any)} on={foodMode === m} onPress={() => setFoodMode(m)} color={GREEN} />
      ))}
    </View>
  );
}

export const discoverQuery = (cc: string, mode: string, lat?: number, lng?: number) =>
  `/food/restaurants/discover?country=${cc}&fulfillment_mode=${mode}${lat != null ? `&lat=${lat}&lng=${lng}` : ''}`;

const styles = themed(() => StyleSheet.create({
  modes: { flexDirection: 'row', gap: 8, paddingHorizontal: 18, marginTop: 16 },
}));
