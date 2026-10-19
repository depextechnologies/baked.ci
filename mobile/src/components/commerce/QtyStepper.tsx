import { Minus, Plus } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme';
import { AppText } from '../ui/AppText';
import { Touchable } from '../ui/Button';

type Props = { qty: number; onChange: (q: number) => void; color: string; testID: string; size?: 'sm' | 'md'; max?: number };

export function QtyStepper({ qty, onChange, color, testID, size = 'md', max = 50 }: Props) {
  const h = size === 'sm' ? 34 : 44;
  return (
    <View style={[styles.wrap, { height: h, borderColor: color }]} testID={testID}>
      <Touchable testID={`${testID}-minus`} onPress={() => onChange(qty - 1)} style={[styles.btn, { width: h }]} hitSlop={4}>
        <Minus color={color} size={size === 'sm' ? 16 : 18} />
      </Touchable>
      <AppText weight="bold" size={size === 'sm' ? 14 : 16} testID={`${testID}-value`}>{qty}</AppText>
      <Touchable testID={`${testID}-plus`} disabled={qty >= max} onPress={() => onChange(qty + 1)} style={[styles.btn, { width: h }]} hitSlop={4}>
        <Plus color={color} size={size === 'sm' ? 16 : 18} />
      </Touchable>
    </View>
  );
}

export function AddButton({ label, onPress, color, testID, disabled }: { label: string; onPress: () => void; color: string; testID: string; disabled?: boolean }) {
  return (
    <Touchable testID={testID} disabled={disabled} onPress={onPress} style={[styles.add, { backgroundColor: disabled ? colors.surface2 : color }]}>
      <Plus color={disabled ? colors.textDim : '#000'} size={16} strokeWidth={2.6} />
      <AppText weight="bold" size={13} color={disabled ? colors.textDim : '#000'}>{label}</AppText>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: radius.pill, backgroundColor: colors.surface },
  btn: { height: '100%', alignItems: 'center', justifyContent: 'center' },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 34, paddingHorizontal: 12, borderRadius: radius.pill },
});
