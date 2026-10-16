import { Map } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useApp } from '@/state/AppContext';
import { colors } from '@/theme';
import { AppText } from './ui/AppText';

type Props = { initial: { latitude: number; longitude: number }; onCenterChange: (c: { latitude: number; longitude: number }) => void };

// Native maps are not available in the web preview build.
export function PinMap(_: Props) {
  const { t } = useApp();
  return (
    <View style={styles.wrap} testID="pin-map-web">
      <Map color={colors.textMuted} size={28} />
      <AppText size={14} color={colors.textMuted} align="center">{t('addr.pin_web')}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
});
