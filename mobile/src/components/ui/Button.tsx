import * as Haptics from 'expo-haptics';
import React from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, themed } from '@/theme';
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
  loading?: boolean; disabled?: boolean; icon?: React.ReactNode; color?: string; textColor?: string; testID?: string;
};

export function Button({ label, onPress, variant = 'primary', loading, disabled, icon, color = colors.text, textColor, testID }: BtnProps) {
  const isPrimary = variant === 'primary';
  const onColor = textColor || (isPrimary ? (color === colors.text ? colors.bg : '#000') : colors.text);
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
      {loading ? <ActivityIndicator color={onColor} /> : (
        <View style={styles.row}>
          {icon}
          <AppText weight="bold" size={16} color={onColor}>{label}</AppText>
        </View>
      )}
    </Touchable>
  );
}

const styles = themed(() => StyleSheet.create({
  btn: { height: 56, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  secondary: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
}));
