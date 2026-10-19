import React from 'react';
import { StyleSheet } from 'react-native';

import { colors, hexA, radius } from '@/theme';
import { AppText } from './AppText';
import { Touchable } from './Button';

type Props = { label: string; on?: boolean; onPress: () => void; color?: string; testID: string; icon?: React.ReactNode };

export function Chip({ label, on, onPress, color = colors.text, testID, icon }: Props) {
  return (
    <Touchable testID={testID} onPress={onPress} accessibilityState={{ selected: !!on }}
      style={[styles.chip, on && { backgroundColor: hexA(color, 0.16), borderColor: color }]}>
      {icon}
      <AppText weight={on ? 'bold' : 'medium'} size={13} color={on ? color : colors.text}>{label}</AppText>
    </Touchable>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
});
