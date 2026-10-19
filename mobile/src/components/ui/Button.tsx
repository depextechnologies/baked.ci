import * as Haptics from 'expo-haptics';
import React from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius } from '@/theme';
import { AppText } from './AppText';

export const tap = () => { if (Platform.OS !== 'web') Haptics.selectionAsync(); };

type PressProps = PressableProps & { style?: StyleProp<ViewStyle>; scale?: number };

// Pressable with a subtle press-down scale and haptic tick.
export function Touchable({ style, scale = 0.97, onPress, children, ...rest }: PressProps) {
  return (
    <Pressable
      {...rest}
      onPress={(e) => { tap(); onPress?.(e); }}
      style={({ pressed }) => [style, { transform: [{ scale: pressed ? scale : 1 }] }, pressed && { opacity: 0.92 }]}
    >
      {children as React.ReactNode}
    </Pressable>
  );
}

type BtnProps = {
  label: string; onPress?: () => void; variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean; disabled?: boolean; icon?: React.ReactNode; color?: string; testID?: string;
};

export function Button({ label, onPress, variant = 'primary', loading, disabled, icon, color = colors.text, testID }: BtnProps) {
  const isPrimary = variant === 'primary';
  return (
    <Touchable
      testID={testID}
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        styles.btn,
        isPrimary && { backgroundColor: color },
        variant === 'secondary' && styles.secondary,
        (disabled || loading) && { opacity: 0.5 },
      ]}
    >
      {loading ? <ActivityIndicator color={isPrimary ? '#000' : '#fff'} /> : (
        <View style={styles.row}>
          {icon}
          <AppText weight="bold" size={16} color={isPrimary ? '#000' : colors.text}>{label}</AppText>
        </View>
      )}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  btn: { height: 56, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  secondary: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
